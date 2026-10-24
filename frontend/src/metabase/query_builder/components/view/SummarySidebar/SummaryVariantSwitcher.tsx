import cx from "classnames";
import { t } from "ttag";

import { Box, Flex, Icon, Text, Tooltip, UnstyledButton } from "metabase/ui";

import S from "./SummarySidebar.module.css";
import { SUMMARY_VARIANTS, type SummaryVariant } from "./types";

const VARIANT_STORAGE_KEY = "metabase-summary-sidebar-prototype-variant";

/** The variant picked last on this browser, so a reload keeps showing it. */
export function getStoredSummaryVariant(): SummaryVariant {
  try {
    const storedValue = localStorage.getItem(VARIANT_STORAGE_KEY);
    return (
      SUMMARY_VARIANTS.find((variant) => variant === storedValue) ??
      SUMMARY_VARIANTS[0]
    );
  } catch {
    return SUMMARY_VARIANTS[0];
  }
}

function storeSummaryVariant(variant: SummaryVariant) {
  try {
    localStorage.setItem(VARIANT_STORAGE_KEY, variant);
  } catch {
    // storage can be disabled; the pick then lasts until the page reloads
  }
}

function getVariantDescription(variant: SummaryVariant) {
  switch (variant) {
    case "a":
      return {
        title: t`A · Pivot frame`,
        description: t`The wells are laid out like the table they build: Group by and Values side by side, and Columns across the top once you press Pivot.`,
      };
    case "b":
      return {
        title: t`B · Sentence`,
        description: t`The summary reads as a sentence, “Show … by … split by …”, so it explains itself as you build it. There's no Pivot button to find: “split by” is always there, and shows as a chart when one fits, or as a pivot table.`,
      };
    case "c":
      return {
        title: t`C · Spreadsheet`,
        description: t`Your columns sit on top and drag down into Group by and Values, and you can add helper columns to them, like in a spreadsheet. Pivot opens Columns between the two.`,
      };
  }
}

type SummaryVariantSwitcherProps = {
  variant: SummaryVariant;
  onChange: (variant: SummaryVariant) => void;
};

/** Prototype-only: switches between the summary layouts being compared. Not part of the feature. */
export function SummaryVariantSwitcher({
  variant,
  onChange,
}: SummaryVariantSwitcherProps) {
  const handleChange = (nextVariant: SummaryVariant) => {
    storeSummaryVariant(nextVariant);
    onChange(nextVariant);
  };

  return (
    <Flex
      className={S.variantSwitcher}
      align="center"
      justify="space-between"
      data-testid="summary-variant-switcher"
    >
      <Flex className={S.variantSwitcherLabel} align="center" gap="xs">
        <Icon name="beaker" size={12} />
        {t`Prototype variant`}
      </Flex>
      <Flex
        className={S.variantOptions}
        role="group"
        aria-label={t`Prototype variant`}
      >
        {SUMMARY_VARIANTS.map((option) => {
          const { title, description } = getVariantDescription(option);
          return (
            <Tooltip
              key={option}
              position="top"
              multiline
              w={280}
              label={
                <Box>
                  <Text fw="bold" c="inherit">
                    {title}
                  </Text>
                  <Text size="sm" c="inherit">
                    {description}
                  </Text>
                </Box>
              }
            >
              <UnstyledButton
                className={cx(S.variantOption, {
                  [S.variantOptionIsActive]: option === variant,
                })}
                aria-pressed={option === variant}
                aria-label={title}
                onClick={() => handleChange(option)}
              >
                {option.toUpperCase()}
              </UnstyledButton>
            </Tooltip>
          );
        })}
      </Flex>
    </Flex>
  );
}
