import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, Icon, Tooltip } from "metabase/ui";

import ExpressionWidgetInfoS from "./ExpressionWidgetInfo.module.css";

export function ExpressionWidgetInfo() {
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    "questions/query-builder/expressions",
    {
      utm: {
        utm_campaign: "custom-expressions",
      },
    },
  );

  return showMetabaseLinks ? (
    <Tooltip
      label={
        <Box component="span" className={ExpressionWidgetInfoS.TooltipLabel}>
          {t`You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.`}
        </Box>
      }
      position="right"
    >
      <ExternalLink
        className={ExpressionWidgetInfoS.InfoLink}
        target="_blank"
        href={docsUrl}
        tabIndex={-1}
        aria-label={t`Open expressions documentation`}
      >
        <Icon w={12} h={12} name="info" />
      </ExternalLink>
    </Tooltip>
  ) : (
    <Tooltip
      label={
        <Box component="span" className={ExpressionWidgetInfoS.TooltipLabel}>
          {t`You can reference columns here in functions or equations, like: floor([Price] - [Discount]).`}
        </Box>
      }
      position="right"
    >
      <Box ml="0.25rem">
        <Icon w={12} h={12} name="info" />
      </Box>
    </Tooltip>
  );
}
