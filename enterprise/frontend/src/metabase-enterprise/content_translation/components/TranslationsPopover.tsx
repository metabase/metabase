import type { ReactNode } from "react";
import { ngettext, t, msgid as ttagMsgid } from "ttag";

import { ClientSortableTable } from "metabase/common/components/Table";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Group, Popover, Stack, Text } from "metabase/ui";
import { useLocaleToTranslationMapping } from "metabase-enterprise/content_translation/hooks";

import S from "./TranslationsPopover.module.css";

export const TranslationsPopover = ({
  enabled,
  msgid,
  children,
}: {
  enabled: boolean;
  msgid: string | null | undefined;
  children: ReactNode;
}) => {
  const { localeToTranslation, isFetching, error } =
    useLocaleToTranslationMapping(enabled ? msgid : undefined);

  if (!enabled || !localeToTranslation) {
    return <>{children}</>;
  }

  const localeToTranslationEntries = Object.entries(localeToTranslation);

  if (!localeToTranslationEntries.length) {
    return <>{children}</>;
  }

  const rows = localeToTranslationEntries.map(([locale, msgstr]) => ({
    id: locale,
    locale,
    msgstr,
  }));

  return (
    <DelayedLoadingAndErrorWrapper loading={isFetching} error={error}>
      <Popover withArrow position="bottom-start" offset={0}>
        <Popover.Target>{children}</Popover.Target>
        <Popover.Dropdown
          p="md"
          maw="18rem"
          bg="var(--mb-color-tooltip-background)"
          c="white"
        >
          <Stack gap="sm">
            <Group wrap="nowrap" gap="sm" align="flex-start">
              <Text c="white" lh={1.2} fz="sm">
                {ngettext(
                  ttagMsgid`The text “${msgid}” has been translated into ${localeToTranslationEntries.length} language.`,
                  `The text “${msgid}” has been translated into ${localeToTranslationEntries.length} languages.`,
                  localeToTranslationEntries.length,
                )}
              </Text>
            </Group>
            <ClientSortableTable<{
              id: string;
              locale: string;
              msgstr: string;
            }>
              className={S.TranslationTable}
              columns={[
                { key: "locale", name: t`Language` },
                { key: "msgstr", name: t`Translation` },
              ]}
              rows={rows}
              rowRenderer={({ locale, msgstr }) => (
                <tr key={locale}>
                  <td>
                    <Text c="white" fz="sm">
                      {locale}
                    </Text>
                  </td>
                  <td>
                    <Text c="white" fz="sm">
                      {msgstr}
                    </Text>
                  </td>
                </tr>
              )}
            />
            <Text
              lh={1.2}
              fz="sm"
              c="white"
            >{t`Editing this text may prevent it from being translated.`}</Text>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </DelayedLoadingAndErrorWrapper>
  );
};
