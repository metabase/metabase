import { t } from "ttag";

import { Box, Modal } from "metabase/ui";

import S from "./ExploreQuestionModal.module.css";

// The app reads these when it runs in an iframe, as in interactive embedding.
const EMBED_OPTIONS = "top_nav=false&side_nav=false";

/** `url` is a router path; the iframe needs it under Metabase's sub-path. */
const getFrameSrc = (url: string): string => {
  const [path, hash] = url.split("#");
  const separator = path.includes("?") ? "&" : "?";
  const root = (window.MetabaseRoot ?? "/").replace(/\/+$/, "");
  return `${root}${path}${separator}${EMBED_OPTIONS}${hash !== undefined ? `#${hash}` : ""}`;
};

type ExploreQuestionModalProps = {
  title: string;
  /** The question's page, e.g. from `Urls.question`. */
  url: string;
  onClose: () => void;
};

/**
 * A question's full page in a large modal, to explore without leaving the
 * document. Changes there are ad hoc and leave the document's chart alone.
 */
export const ExploreQuestionModal = ({
  title,
  url,
  onClose,
}: ExploreQuestionModalProps) => (
  <Modal
    opened
    title={title}
    size="90vw"
    padding={0}
    classNames={{ header: S.header, body: S.body }}
    onClose={onClose}
  >
    <Box
      component="iframe"
      className={S.frame}
      src={getFrameSrc(url)}
      title={t`Explore ${title}`}
    />
  </Modal>
);
