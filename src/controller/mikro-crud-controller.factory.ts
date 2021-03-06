import { AnyEntity, EntityData } from "@mikro-orm/core";
import {
  Body,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Type,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { AbstractFactory } from "../abstract.factory";
import { ReqUser } from "../decorators";
import { QueryParamsFactory } from "../dto";
import { MikroCrudService, MikroCrudServiceFactory } from "../service";
import { FACTORY, TS_TYPE } from "../symbols";
import { ActionName, LookupableField, PkType } from "../types";
import { MikroCrudControllerFactoryOptions } from "./mikro-crud-controller-factory-options.interface";
import { MikroCrudController } from "./mikro-crud-controller.class";

type ServiceGenerics<Service> = Service extends MikroCrudService<
  infer Entity,
  infer CreateDto,
  infer UpdateDto
>
  ? {
      Entity: Entity;
      CreateDto: CreateDto;
      UpdateDto: UpdateDto;
    }
  : never;

export class MikroCrudControllerFactory<
  Service extends MikroCrudService<
    Entity,
    CreateDto,
    UpdateDto
  > = MikroCrudService<any, any, any>,
  Entity extends AnyEntity<Entity> = ServiceGenerics<Service>["Entity"],
  CreateDto extends EntityData<Entity> = ServiceGenerics<Service>["CreateDto"],
  UpdateDto extends EntityData<Entity> = ServiceGenerics<Service>["UpdateDto"],
  LookupField extends LookupableField<Entity> = LookupableField<Entity>
> extends AbstractFactory<
  MikroCrudController<Entity, CreateDto, UpdateDto, LookupField, Service>
> {
  readonly serviceFactory;
  readonly options;
  readonly product;

  constructor(
    options: MikroCrudControllerFactoryOptions<
      Entity,
      CreateDto,
      UpdateDto,
      LookupField,
      Service
    >
  ) {
    super();

    this.serviceFactory = Reflect.getMetadata(
      FACTORY,
      options.service
    ) as MikroCrudServiceFactory<Entity, CreateDto, UpdateDto>;

    this.options = this.standardizeOptions(options);

    this.product = this.create();
    this.buildActions();
    Reflect.defineMetadata(FACTORY, this, this.product);
  }

  protected standardizeOptions(
    options: MikroCrudControllerFactoryOptions<
      Entity,
      CreateDto,
      UpdateDto,
      LookupField,
      Service
    >
  ) {
    const {
      params = new QueryParamsFactory({}).product,
      lookup,
      requestUser = { decorators: [ReqUser()] },
      validationPipeOptions = {},
    } = options;

    return {
      ...options,
      params,
      lookup: {
        ...lookup,
        type:
          lookup.type ??
          ((Reflect.getMetadata(
            TS_TYPE,
            this.serviceFactory.options.entity.prototype,
            lookup.field
          ) == Number
            ? "number"
            : "uuid") as PkType),
        name: lookup.name ?? "lookup",
      },
      requestUser: {
        ...requestUser,
        type: requestUser.type ?? Object,
      },
      validationPipeOptions: {
        ...validationPipeOptions,
        transform: true,
        transformOptions: {
          ...validationPipeOptions.transformOptions,
          exposeDefaultValues: true,
        },
      },
    };
  }

  protected create(): Type<
    MikroCrudController<Entity, CreateDto, UpdateDto, LookupField, Service>
  > {
    const {
      service,
      lookup: { field: lookupField },
    } = this.options;

    @UsePipes(new ValidationPipe(this.options.validationPipeOptions))
    class Controller extends MikroCrudController<
      Entity,
      CreateDto,
      UpdateDto,
      LookupField,
      Service
    > {
      @Inject(service)
      readonly service!: Service;

      readonly lookupField = lookupField;
    }

    return Controller;
  }

  protected buildActions() {
    const {
      lookup: { type: lookupType, name: lookupParamName },
    } = this.options;
    const lookupInternalType = lookupType == "number" ? Number : String;

    const { dto } = this.serviceFactory.options;
    const {
      params: queryParamsClass,
      requestUser: { type: reqUserType, decorators: reqUserDecorators },
    } = this.options;

    const path = `:${lookupParamName}`;

    const Lookup = Param(
      lookupParamName,
      ...(lookupType == "number"
        ? [ParseIntPipe]
        : lookupType == "uuid"
        ? [ParseUUIDPipe]
        : [])
    );
    const Queries = Query();
    const Data = Body();

    const table: Record<
      ActionName,
      [MethodDecorator[], Type[], ParameterDecorator[][]]
    > = {
      list: [[Get()], [queryParamsClass], [[Queries]]],
      create: [[Post()], [queryParamsClass, dto.create], [[Queries], [Data]]],
      retrieve: [
        [Get(path)],
        [lookupInternalType, queryParamsClass],
        [[Lookup], [Queries]],
      ],
      replace: [
        [Put(path)],
        [lookupInternalType, queryParamsClass, dto.create],
        [[Lookup], [Queries], [Data]],
      ],
      update: [
        [Patch(path)],
        [lookupInternalType, queryParamsClass, dto.update],
        [[Lookup], [Queries], [Data]],
      ],
      destroy: [
        [Delete(path), HttpCode(204)],
        [lookupInternalType],
        [[Lookup]],
      ],
    };

    for (const [
      k,
      [methodDecorators, paramTypes, paramDecoratorSets],
    ] of Object.entries(table)) {
      const name = k as ActionName;
      if (this.options.actions.includes(name))
        this.applyMethodDecorators(name, ...methodDecorators);
      this.defineParamTypes(
        name,
        ...paramTypes,
        reqUserType
      ).applyParamDecoratorSets(name, ...paramDecoratorSets, reqUserDecorators);
    }
  }
}
