import Dimension from "metabase-lib/lib/Dimension";
import Field from "metabase-lib/lib/metadata/Field";

interface ISectionOption {
  dimension: Dimension;
}

export interface ISection {
  name: string;
  icon: string;
  items: ISectionOption[];
}

export interface IDimensionFK {
  name?: string;
  icon?: string;
  field: Field;
  dimensions: Dimension[];
}

export interface IDimensionOptionsProps {
  name: string;
  icon: string;
  count: number;
  dimensions: Dimension[];
  fks: IDimensionFK[];
}

export interface IDimensionOptions {
  all(): Dimension[];
  hasDimension(dimension: Dimension): boolean;
  sections(options?: { extraItems?: ISectionOption[] }): ISection[];
}
