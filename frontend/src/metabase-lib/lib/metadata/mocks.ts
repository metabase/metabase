import { createMockField } from "metabase-types/api/mocks/field";
import { Field as ApiField } from "metabase-types/api";
import Field from "./Field";

interface ICreateMockConcreteFieldProps {
  apiOpts?: Partial<ApiField>;
  instanceOpts?: Partial<Field>;
}

export function createMockConcreteField({
  apiOpts,
  instanceOpts,
}: ICreateMockConcreteFieldProps): Field {
  const mockField = createMockField(apiOpts);
  const instance = new Field(mockField);

  Object.assign(instance, instanceOpts);

  return instance;
}

export function createMockVirtualField({
  constructorOpts,
  instanceOpts,
}: {
  constructorOpts?: Partial<Field>;
  instanceOpts?: Partial<Field>;
}) {
  const instance = new Field(constructorOpts);

  Object.assign(instance, instanceOpts);

  return instance;
}
