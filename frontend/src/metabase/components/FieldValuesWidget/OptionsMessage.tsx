import React from "react";

type Props = {
  children: React.ReactNode;
};

export default function OptionsMessage({ children }: Props) {
  return (
    <div className="flex layout-centered p4 border-bottom">{children}</div>
  );
}
