import { type PropsWithChildren, memo } from "react";

import S from "./List.module.css";

const List = ({ children }: PropsWithChildren) => (
  <ul className={S.list}>{children}</ul>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(List);
