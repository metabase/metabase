import type { GroupId } from "metabase-types/api";

export type MappingsType = Record<string, GroupId[]>;
export type DeleteMappingModalValueType = "nothing" | "clear" | "delete";
export type CascadeValue = Exclude<DeleteMappingModalValueType, "nothing">;
