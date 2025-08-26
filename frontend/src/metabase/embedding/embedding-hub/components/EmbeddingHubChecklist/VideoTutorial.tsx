import { type Ref, forwardRef } from "react";

import type { EmbeddingHubVideo as IEmbeddingHubVideo } from "../../types/embedding-checklist";

import S from "./EmbeddingHubChecklist.module.css";

export const EmbeddingHubVideo = forwardRef(function EmbeddingHubVideo(
  { id, trackingId, title }: IEmbeddingHubVideo,
  ref: Ref<HTMLIFrameElement>,
) {
  return (
    <iframe
      allowFullScreen
      className={S.video}
      loading="lazy"
      ref={ref}
      src={`https://www.youtube.com/embed/${id}?si=${trackingId}&rel=0&enablejsapi=1`}
      title={title}
    />
  );
});
