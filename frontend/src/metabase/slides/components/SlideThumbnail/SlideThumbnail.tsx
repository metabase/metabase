import cx from "classnames";
import { type MouseEvent, type ReactNode, forwardRef } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import type { Slide } from "../../types";

import S from "./SlideThumbnail.module.css";

interface SlideThumbnailProps {
  slide: Slide;
  index: number;
  active: boolean;
  onClick: () => void;
  menu?: ReactNode;
}

// Pull a one-line preview from the slide data (no chart embed for cost).
const previewTitle = (slide: Slide): string => {
  switch (slide.layout) {
    case "cover":
    case "closing":
    case "bullets":
    case "chart_hero":
    case "metrics_grid":
    case "title_metrics_with_chart":
    case "two_column":
      return slide.data.title ?? t`Untitled`;
    case "big_quote":
      return slide.data.quote;
    default:
      return t`Untitled`;
  }
};

const hasChart = (slide: Slide): boolean => {
  switch (slide.layout) {
    case "chart_hero":
    case "title_metrics_with_chart":
    case "two_column":
      return Boolean(slide.data.card_id);
    case "metrics_grid":
      return slide.data.metrics.some((m) => m.card_id);
    default:
      return false;
  }
};

export const SlideThumbnail = forwardRef<HTMLDivElement, SlideThumbnailProps>(
  function SlideThumbnail({ slide, index, active, onClick, menu }, ref) {
    const isCover = slide.layout === "cover";
    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      if ((e.target as HTMLElement).closest("[data-thumbnail-menu]")) {
        return;
      }
      onClick();
    };

    return (
      <div className={S.row} ref={ref}>
        <div className={S.indexBadge}>{index + 1}</div>
        <div className={S.thumbnailWrap}>
          <button
            type="button"
            onClick={handleClick}
            className={cx(S.thumbnail, {
              [S.active]: active,
              [S.thumbnailCover]: isCover,
            })}
            aria-label={t`Go to slide ${index + 1}`}
            aria-current={active ? "page" : undefined}
          >
            <div className={S.heading}>{previewTitle(slide)}</div>
            <div className={S.body}>{layoutPreview(slide)}</div>
            {hasChart(slide) && (
              <div className={S.chartTag}>
                <Icon name="line" size={10} />
                {t`Chart`}
              </div>
            )}
            {menu && (
              <div className={S.menuButton} data-thumbnail-menu>
                {menu}
              </div>
            )}
          </button>
        </div>
      </div>
    );
  },
);

const layoutPreview = (slide: Slide): string => {
  switch (slide.layout) {
    case "bullets":
      return slide.data.bullets[0] ?? "";
    case "chart_hero":
      return slide.data.caption ?? "";
    case "two_column":
      return slide.data.bullets[0] ?? "";
    case "metrics_grid":
      return slide.data.metrics
        .map((m) => `${m.value} ${m.label}`)
        .slice(0, 2)
        .join(" · ");
    case "title_metrics_with_chart":
      return slide.data.description ?? "";
    case "closing":
      return slide.data.subtitle ?? "";
    case "cover":
      return slide.data.subtitle ?? "";
    case "big_quote":
      return slide.data.attribution ?? "";
    default:
      return "";
  }
};
