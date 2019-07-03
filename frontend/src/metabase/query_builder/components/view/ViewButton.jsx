import React from "react";

import Button from "metabase/components/Button";
import colors, { alpha } from "metabase/lib/colors";

export default function ViewButton({
  color = colors["brand"],
  active,
  style = {},
  ...props
}) {
  return (
    <Button
      style={{
        ...style,
        ...(color && active
          ? { backgroundColor: color, color: "white", border: "none" }
          : color && !active
          ? { backgroundColor: alpha(color, 0.2), color: color, border: "none" }
          : {}),
      }}
      {...props}
    />
  );
}
