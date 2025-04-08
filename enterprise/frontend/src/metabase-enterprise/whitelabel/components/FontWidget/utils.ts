import { useMemo } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";

const CUSTOM = "custom";

export const useGetFontOptions = () => {
  const { value: availableFonts } = useAdminSetting("available-fonts");
  const options = useMemo(
    () => [
      ...(availableFonts ?? []).map((font) => ({ label: font, value: font })),
      { label: t`Custom…`, value: CUSTOM },
    ],
    [availableFonts],
  );
  return options;
};
