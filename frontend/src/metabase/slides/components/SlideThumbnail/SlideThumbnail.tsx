import cx from "classnames";
import { type MouseEvent, type ReactNode, forwardRef } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import type { Slide } from "../../types";
import { previewSlide } from "../../utils/extractText";

import S from "./SlideThumbnail.module.css";

interface SlideThumbnailProps {
  slide: Slide;
  index: number;
  active: boolean;
  onClick: () => void;
  menu?: ReactNode;
}

export const SlideThumbnail = forwardRef<HTMLDivElement, SlideThumbnailProps>(
  function SlideThumbnail({ slide, index, active, onClick, menu }, ref) {
    const preview = previewSlide(slide.doc);
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
            {preview.heading ? (
              <div className={S.heading}>{preview.heading}</div>
            ) : (
              <div className={S.heading} style={{ opacity: 0.4 }}>
                {t`Untitled slide`}
              </div>
            )}
            {preview.body && <div className={S.body}>{preview.body}</div>}
            {preview.hasChart && (
              <div className={S.chartTag}>
                <Icon name="line" size={10} />
                {preview.chartCount > 1
                  ? t`${preview.chartCount} charts`
                  : t`Chart`}
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
