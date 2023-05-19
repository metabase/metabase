import { TreeList } from "@ui/tree/Tree/index";
import { useState } from "react";

const formData = [
  {
    name: "John Doe",
    email: "john@mantine.dev",
  },
  {
    name: "Bill Love",
    email: "bill@mantine.dev",
  },
  {
    name: "Nancy Eagle",
    email: "nanacy@mantine.dev",
  },
  {
    name: "Lim Notch",
    email: "lim@mantine.dev",
  },
  {
    name: "Susan Seven",
    email: "susan@mantine.dev",
  },
];
export const TreePreview = () => {
  const [selected, setSelected] = useState([]);

  return (
    <TreeList
      form={formData}
      selected={selected}
      setSelected={setSelected}
    ></TreeList>
  );
};
