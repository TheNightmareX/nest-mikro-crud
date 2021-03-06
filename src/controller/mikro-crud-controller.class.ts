import { AnyEntity, EntityData } from "@mikro-orm/core";
import { NotFoundException } from "@nestjs/common";
import { QueryParams } from "../dto";
import { MikroCrudService } from "../service";
import { LookupableField } from "../types";

export abstract class MikroCrudController<
  Entity extends AnyEntity<Entity> = any,
  CreateDto extends EntityData<Entity> = EntityData<Entity>,
  UpdateDto extends EntityData<Entity> = EntityData<Entity>,
  LookupField extends LookupableField<Entity> = LookupableField<Entity>,
  Service extends MikroCrudService<
    Entity,
    CreateDto,
    UpdateDto
  > = MikroCrudService<Entity, CreateDto, UpdateDto>
> {
  readonly service!: Service;
  readonly lookupField!: LookupField;

  async list(
    { limit, offset, order, filter, expand }: QueryParams<Entity>,
    user: any
  ): Promise<unknown> {
    const { total, results } = await this.service.list({
      limit,
      offset,
      order,
      filter,
      expand,
      user,
    });
    await Promise.all(
      results.map(
        async (entity) =>
          await this.service.adjustPopulationStatus({ entity, expand })
      )
    );
    await this.service.save();
    return { total, results };
  }

  async create(
    { expand }: QueryParams<Entity>,
    data: CreateDto,
    user: any
  ): Promise<unknown> {
    let entity = await this.service.create({ data, user });
    await this.service.save();
    entity = await this.service.retrieve({
      conditions: this.getPrimaryKey(entity),
      expand,
      refresh: true,
      user,
    });
    await this.service.adjustPopulationStatus({ entity, expand });
    await this.service.save();
    return entity;
  }

  async retrieve(
    lookup: Entity[LookupField],
    { expand }: QueryParams<Entity>,
    user: any
  ): Promise<unknown> {
    const conditions = { [this.lookupField]: lookup };
    const entity = await this.service
      .retrieve({
        conditions,
        expand,
        user,
      })
      .catch(() => {
        throw new NotFoundException();
      });
    await this.service.adjustPopulationStatus({ entity, expand });
    await this.service.save();
    return entity;
  }

  async replace(
    lookup: Entity[LookupField],
    { expand }: QueryParams<Entity>,
    data: CreateDto,
    user: any
  ): Promise<unknown> {
    const conditions = { [this.lookupField]: lookup };
    let entity = await this.service
      .retrieve({
        conditions,
        expand,
        user,
      })
      .catch(() => {
        throw new NotFoundException();
      });
    await this.service.replace({ entity, data, user });
    await this.service.save();
    entity = await this.service.retrieve({
      conditions: this.getPrimaryKey(entity),
      expand,
      refresh: true,
      user,
    });
    await this.service.adjustPopulationStatus({ entity, expand });
    await this.service.save();
    return entity;
  }

  async update(
    lookup: Entity[LookupField],
    { expand }: QueryParams<Entity>,
    data: UpdateDto,
    user: any
  ): Promise<unknown> {
    const conditions = { [this.lookupField]: lookup };
    let entity = await this.service
      .retrieve({
        conditions,
        expand,
        user,
      })
      .catch(() => {
        throw new NotFoundException();
      });
    await this.service.update({ entity, data, user });
    await this.service.save();
    entity = await this.service.retrieve({
      conditions: this.getPrimaryKey(entity),
      expand,
      refresh: true,
      user,
    });
    await this.service.adjustPopulationStatus({ entity, expand });
    await this.service.save();
    return entity;
  }

  async destroy(lookup: Entity[LookupField], user: any): Promise<unknown> {
    const conditions = { [this.lookupField]: lookup };
    const entity = await this.service
      .retrieve({ conditions, user })
      .catch(() => {
        throw new NotFoundException();
      });
    await this.service.destroy({ entity, user });
    await this.service.save();
    return;
  }

  private getPrimaryKey(entity: AnyEntity) {
    const pkField = entity.__helper!.__meta.primaryKeys[0];
    return { [pkField]: entity[pkField] };
  }
}
