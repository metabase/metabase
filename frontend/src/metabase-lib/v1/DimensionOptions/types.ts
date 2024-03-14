import type Dimension from "metabase-lib/v1/Dimension";
import type Field from "metabase-lib/v1/metadata/Field";

interface DimensionOptionsSectionItem {
  dimension: Dimension;
}

export interface DimensionOptionsSection {
  name: string | null;
  icon: string;
  items: DimensionOptionsSectionItem[];
}

export interface DimensionFK {
  name?: string;
  icon?: string;
  field: Field;
  dimensions: Dimension[];
}

export interface DimensionOptionsProps {
  name?: string;
  icon?: string;
  count: number;
  dimensions: Dimension[];
  fks: DimensionFK[];
}
