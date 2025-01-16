import cx from "classnames";

import S from "./ModelsVideo.module.css";

export const ModelsVideo = ({ autoplay }: { autoplay: 0 | 1 }) => {
  return (
    <iframe
      allowFullScreen
      className={cx(S.video)}
      referrerPolicy="strict-origin-when-cross-origin"
      src={`https://www.youtube.com/embed/Cb7-wLAgSCA?si=gPukXurSJAM8asGJ&autoplay=${autoplay}`}
      // eslint-disable-next-line no-literal-metabase-strings -- It's just a title for the a11y purposes
      title="Use Models in Metabase | Getting started with Metabase"
      width="100%"
    ></iframe>
  );
};

export const ModelsVideoThumnail = ({ onClick }: { onClick: () => void }) => {
  return (
    <div
      className={cx(S.thumbnail)}
      data-testid="browse-models-video-thumbnail"
      onClick={onClick}
    >
      <img
        alt="Browse models video thumbnail"
        loading="lazy"
        src="app/assets/img/browse-models-video-thumbnail.png"
        width="100%"
      />
    </div>
  );
};
