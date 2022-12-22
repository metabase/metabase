export interface TooltipRowModel {
  color?: string;
  name: string;
  value: string;
  percent?: number;
}

export interface TooltipModel {
  headerTitle?: string;
  headerRows: TooltipRowModel[];
  bodyRows?: TooltipRowModel[];
  totalValue?: string;
}
