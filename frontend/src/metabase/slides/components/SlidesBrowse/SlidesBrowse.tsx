import dayjs from "dayjs";
import { Link } from "react-router";
import { t } from "ttag";

import { useListSlidesQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
// Pulls in dayjs.extend(relativeTime), so `.fromNow()` is available app-wide.
import "metabase/utils/dayjs";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Box, Button, Icon, Loader } from "metabase/ui";

import type { Slide, SlidesDeck } from "../../types";

import S from "./SlidesBrowse.module.css";

const coverTitle = (slide: Slide | undefined): string => {
  if (!slide) {
    return "";
  }
  switch (slide.layout) {
    case "big_quote":
      return slide.data.quote;
    default:
      return (slide.data as { title?: string }).title ?? "";
  }
};

export const SlidesBrowse = () => {
  usePageTitle(t`Slides`);
  const { data, isLoading } = useListSlidesQuery();

  const decks: SlidesDeck[] = data?.items ?? [];

  return (
    <Box className={S.page}>
      <Box className={S.header}>
        <h1 className={S.title}>
          <Icon name="play" size={24} />
          {t`Slides`}
        </h1>
        <Button
          component={ForwardRefLink}
          to="/slides/new"
          variant="filled"
          leftSection={<Icon name="add" />}
        >
          {t`New deck`}
        </Button>
      </Box>

      {isLoading ? (
        <Box style={{ textAlign: "center", padding: 80 }}>
          <Loader />
        </Box>
      ) : decks.length === 0 ? (
        <Box className={S.empty}>
          <Box className={S.emptyTitle}>{t`No slide decks yet`}</Box>
          <Box>{t`Make your first one — write it by hand, or let AI draft it.`}</Box>
        </Box>
      ) : (
        <Box className={S.grid}>
          {decks.map((deck) => {
            const first = deck.slides?.[0];
            return (
              <Link key={deck.id} to={`/slides/${deck.id}`} className={S.deck}>
                <Box className={S.deckPreview}>
                  <Box className={S.deckPreviewHeading}>
                    {coverTitle(first) || deck.name || t`Untitled slides`}
                  </Box>
                </Box>
                <Box className={S.deckMeta}>
                  <Box className={S.deckMetaName}>{deck.name}</Box>
                  <Box className={S.deckMetaSub}>
                    {t`Updated ${dayjs(deck.updated_at).fromNow()}`} ·{" "}
                    {deck.slides.length} {t`slides`}
                  </Box>
                </Box>
              </Link>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
