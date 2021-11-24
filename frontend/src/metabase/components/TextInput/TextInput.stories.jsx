import React, { useState } from "react";
import TextInput from "./TextInput";

export default {
  title: "Components/TextInput",
  component: TextInput,
};

export const Default = args => {
  const [value, setValue] = useState("");
  return <TextInput {...args} value={value} onChange={setValue} />;
};

Default.args = { hasClearButton: false };
