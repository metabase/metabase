import type { ReactNode } from "react";
import { memo } from "react";

import S from "./List.module.css";

interface ListProps {
  children: ReactNode;
}

const ListInner = ({ children }: ListProps) => (
  <ul className={S.list}>{children}</ul>
);

export const List = memo(ListInner);
