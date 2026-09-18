export type MappingsType = Record<string, number[]>;
export type GroupIds = number[];
export type DeleteMappingModalValueType = "nothing" | "clear" | "delete";
export type CascadeValue = Exclude<DeleteMappingModalValueType, "nothing">;
