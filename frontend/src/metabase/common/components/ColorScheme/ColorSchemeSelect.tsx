import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import { useColorScheme } from "metabase/ui/components/theme/ColorSchemeProvider";

export function ColorSchemeSelect(
  props: Omit<SelectProps, "data"> & { id?: string },
) {
  const { colorScheme, setColorScheme } = useColorScheme();

  return (
    <Select
      {...props}
      value={colorScheme}
      data={[
        { value: "auto", label: t`Use system default` },
        { value: "dark", label: t`Dark` },
        { value: "light", label: t`Light` },
      ]}
      onChange={(val) => setColorScheme(val)}
    />
  );
}
