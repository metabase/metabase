import React from "react";

export interface BrandColorTableProps {
  colors: Record<string, string>;
  onChange?: (colors: Record<string, string>) => void;
}

const BrandColorTable = (): JSX.Element => {
  return <div />;
};

export default BrandColorTable;
