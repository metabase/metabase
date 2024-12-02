import styled from "@emotion/styled";
import type { ReactNode } from "react";

export const SectionTitle = styled.div`
  margin-bottom: 12px;
  font-size: 12px;
  line-height: 16px;
  color: var(--mb-color-text-medium);
`;

export const SectionItems = styled.div`
  margin-bottom: 24px;
  border: 1px solid hsla(0, 0%, 94%, 1);
  border-radius: 4px;
  overflow: hidden;
`;

interface Props {
  children: ReactNode;
  operatorPicker?: ReactNode;
  title: ReactNode;
}

const ItemGrid = ({ children, operatorPicker, title }: Props) => (
  <div
    style={{
      display: "grid",
      alignItems: "center",
      gridTemplateColumns: operatorPicker ? "210px 160px 1fr" : "210px 1fr",
      gap: 40,
      padding: "8px 16px",
    }}
  >
    <div>{title}</div>
    {operatorPicker && <div>{operatorPicker}</div>}
    <div>{children}</div>
  </div>
);

// eslint-disable-next-line import/no-default-export
export default ItemGrid;
