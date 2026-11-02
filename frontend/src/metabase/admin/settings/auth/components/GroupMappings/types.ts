export type DeleteMappingModalValueType = "nothing" | "clear" | "delete";
export type CascadeValue = Exclude<DeleteMappingModalValueType, "nothing">;
