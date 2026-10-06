import cx from "classnames";
import { msgid, ngettext, t } from "ttag";

import { useGetFieldQuery, useGetFieldValuesQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Loader, Stack } from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";
import type { FieldId, FieldValue } from "metabase-types/api";

import { Fade } from "../MetadataInfo";

import S from "./GlobalFingerprint.module.css";

interface GlobalFingerprintProps {
  className?: string;
  fieldId: FieldId;
  showAllFieldValues?: boolean;
}

const FIELD_VALUES_SHOW_LIMIT = 35;

export function GlobalFingerprint({
  className,
  fieldId,
  showAllFieldValues,
}: GlobalFingerprintProps) {
  const { data: field } = useGetFieldQuery({ id: fieldId });
  const hasListValues = field?.has_field_values === "list";
  const { data: fieldData, isLoading } = useGetFieldValuesQuery(fieldId, {
    skip: !hasListValues,
  });

  const fieldValues = fieldData ? fieldData.values : [];
  const distinctCount = field?.fingerprint?.global?.["distinct-count"];
  const formattedDistinctCount =
    distinctCount !== undefined && formatNumber(distinctCount);

  const showDistinctCount = isLoading || distinctCount != null;
  const showFieldValuesBlock = isLoading || fieldValues.length > 0;
  const showComponent = showDistinctCount || showFieldValuesBlock;

  return showComponent ? (
    <Stack className={cx(CS.overflowHidden, className)} pos="relative" gap="sm">
      {showDistinctCount && (
        <Box pos="relative" h="1em" lh="1em">
          <Fade
            pos="absolute"
            top={0}
            left={0}
            w="100%"
            aria-hidden={!isLoading}
            visible={!isLoading}
          >
            {ngettext(
              msgid`${formattedDistinctCount} distinct value`,
              `${formattedDistinctCount} distinct values`,
              distinctCount || 0,
            )}
          </Fade>
          {hasListValues && (
            <Fade
              pos="absolute"
              top={0}
              left={0}
              w="100%"
              aria-hidden={!isLoading}
              visible={isLoading}
            >{t`Getting distinct values...`}</Fade>
          )}
        </Box>
      )}
      {showFieldValuesBlock &&
        (showAllFieldValues ? (
          <ExtendedFieldValuesList fieldValues={fieldValues} />
        ) : (
          <ShortenedFieldValuesList
            isLoading={isLoading}
            fieldValues={fieldValues}
          />
        ))}
    </Stack>
  ) : null;
}

interface ExtendedFieldValuesListProps {
  fieldValues: FieldValue[];
}

function ExtendedFieldValuesList({
  fieldValues,
}: ExtendedFieldValuesListProps) {
  return (
    <ul>
      {fieldValues.map((fieldValue, i) => {
        const value = Array.isArray(fieldValue) ? fieldValue[0] : fieldValue;
        if (value === null) {
          return null;
        }
        return (
          <Box
            component="li"
            key={i}
            className={cx(S.item, CS.overflowHidden, CS.textEllipsis)}
            py="xxs"
          >
            {value.toString()}
          </Box>
        );
      })}
    </ul>
  );
}

interface ShortenedFieldValuesListProps {
  isLoading: boolean;
  fieldValues: FieldValue[];
}

function ShortenedFieldValuesList({
  isLoading,
  fieldValues,
}: ShortenedFieldValuesListProps) {
  const shortenedValuesStr = fieldValues
    .slice(0, FIELD_VALUES_SHOW_LIMIT)
    .map((value) => (Array.isArray(value) ? value[0] : value))
    .filter((value) => value !== null)
    .join(", ");

  return (
    <Box pos="relative" h={isLoading ? "1.8em" : "1.5em"} lh="1em">
      <Fade pos="absolute" top={0} left={0} w="100%" visible={isLoading}>
        <Flex justify="center">
          <Loader size={18} color="core-brand" />
        </Flex>
      </Fade>
      <Fade pos="absolute" w="100%" slide visible={!isLoading}>
        <Box
          className={cx(CS.textNoWrap, CS.overflowHidden, CS.textEllipsis)}
          fw="bold"
          lh="1.3em"
        >
          {shortenedValuesStr}
        </Box>
      </Fade>
    </Box>
  );
}
