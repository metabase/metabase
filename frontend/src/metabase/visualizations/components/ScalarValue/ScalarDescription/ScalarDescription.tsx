import { Markdown } from "metabase/common/components/Markdown";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { Box, Icon, Tooltip } from "metabase/ui";

import S from "./ScalarDescription.module.css";

export const DESCRIPTION_ICON_SIZE = 16;

export function ScalarDescription({ description }: { description: string }) {
  const tc = useTranslateContent();

  return (
    <Tooltip
      label={
        <Markdown dark compact disallowHeading unstyleLinks lineClamp={8}>
          {tc(description)}
        </Markdown>
      }
      maw="22em"
    >
      <Box component="span" tabIndex={0} className={S.descriptionIcon}>
        <Icon name="info" size={DESCRIPTION_ICON_SIZE} />
      </Box>
    </Tooltip>
  );
}
