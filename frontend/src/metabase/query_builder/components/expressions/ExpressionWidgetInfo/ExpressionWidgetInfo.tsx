import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Box, Tooltip } from "metabase/ui";

import {
  FieldTitleIcon,
  InfoLink,
  TooltipLabel,
} from "./ExpressionWidgetInfo.styled";

export const EXPRESSIONS_DOCUMENTATION_URL = MetabaseSettings.docsUrl(
  "questions/query-builder/expressions",
);

export function ExpressionWidgetInfo() {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  return showMetabaseLinks ? (
    <Tooltip
      label={
        <TooltipLabel>
          {t`You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.`}
        </TooltipLabel>
      }
      position="right"
    >
      <InfoLink
        target="_blank"
        href={EXPRESSIONS_DOCUMENTATION_URL}
        tabIndex={-1}
        aria-label={t`Open expressions documentation`}
      >
        <FieldTitleIcon name="info" />
      </InfoLink>
    </Tooltip>
  ) : (
    <Tooltip
      label={
        <TooltipLabel>
          {t`You can reference columns here in functions or equations, like: floor([Price] - [Discount]).`}
        </TooltipLabel>
      }
      position="right"
    >
      <Box ml="0.25rem">
        <FieldTitleIcon name="info" />
      </Box>
    </Tooltip>
  );
}
