import React from "react";

import { TabListProps } from "../TabList/TabList";
import { TabList } from "./TabLinkList.styled";

export default function TabLinkList<T>({
  onChange,
  ...props
}: TabListProps<T>) {
  return <TabList onChange={onChange as (value: unknown) => void} {...props} />;
}
