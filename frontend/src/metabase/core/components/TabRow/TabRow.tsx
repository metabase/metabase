import React from "react";

import { TabListProps } from "../TabList/TabList";
import { TabList } from "./TabRow.styled";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function TabRow<T>({ onChange, ...props }: TabListProps<T>) {
  return <TabList onChange={onChange as (value: unknown) => void} {...props} />;
}
