import cx from "classnames";
import { t } from "ttag";

import S from "./ModelsVideo.module.css";

export const ModelsVideo = ({ autoplay }: { autoplay: 0 | 1 }) => {
  return (
    <iframe
      allowFullScreen
      className={cx(S.video)}
      referrerPolicy="strict-origin-when-cross-origin"
      src={`https://www.youtube.com/embed/Cb7-wLAgSCA?si=gPukXurSJAM8asGJ&autoplay=${autoplay}`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- It's just a title for the a11y purposes
      title={t`Use Models in Metabase | Getting started with Metabase`}
      width="100%"
    ></iframe>
  );
};

export const ModelsVideoThumbnail = ({ onClick }: { onClick: () => void }) => {
  return (
    <div
      className={cx(S.thumbnail)}
      data-testid="browse-models-video-thumbnail"
      onClick={onClick}
    >
      <img
        alt={t`Browse models video thumbnail`}
        loading="lazy"
        src="app/assets/img/browse-models-video-thumbnail.png"
        width="100%"
      />
    </div>
  );
};
