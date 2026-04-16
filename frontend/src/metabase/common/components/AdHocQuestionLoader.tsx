import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { deserializeCardFromUrl } from "metabase/utils/card";
import { useDispatch, useSelector } from "metabase/utils/redux";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { UnsavedCard } from "metabase-types/api";

type ChildrenProps = {
  question: Question | null;
  loading: boolean;
  error: unknown;
};

type AdHocQuestionLoaderViewProps = {
  questionHash: string | null;
  metadata?: Metadata;
  loadMetadataForCard: (
    card: UnsavedCard,
    options?: { includeSensitiveFields?: boolean },
  ) => Promise<void>;
  includeSensitiveFields?: boolean;
  children: (state: ChildrenProps) => ReactNode;
};

type AdHocQuestionLoaderProps = {
  questionHash: string | null;
  includeSensitiveFields?: boolean;
  children: (state: ChildrenProps) => ReactNode;
};

/**
 * AdHocQuestionLoader
 *
 * Load a transient question via its encoded URL and return it to the calling
 * component
 *
 * @example
 *
 * Render prop style
 * import { AdHocQuestionLoader } from 'metabase/common/components/AdHocQuestionLoader'
 *
 * function ExampleAdHocQuestionFeature({ params }) {
 *   return (
 *     <AdHocQuestionLoader questionHash={params.questionHash}>
 *       {({ question, loading, error }) => {
 *         // render content
 *       }}
 *     </AdHocQuestionLoader>
 *   );
 * }
 *
 * The raw component (AdHocQuestionLoaderView) is also exported so we can unit
 * test it without the redux store.
 */
export function AdHocQuestionLoaderView({
  questionHash,
  metadata,
  loadMetadataForCard: loadMetadata,
  includeSensitiveFields,
  children,
}: AdHocQuestionLoaderViewProps) {
  const [question, setQuestion] = useState<Question | null>(null);
  // keep a reference to the card as well to help with re-creating question
  // objects if the underlying metadata changes
  const [card, setCard] = useState<UnsavedCard | null>(null);
  const [loading, setLoading] = useState(Boolean(questionHash));
  const [error, setError] = useState<unknown>(null);

  const metadataRef = useRef<Metadata | undefined>(metadata);
  metadataRef.current = metadata;

  useEffect(() => {
    let cancelled = false;

    /*
     * Load an AdHoc question and any required metadata
     *
     * 1. Decode the question via the URL
     * 2. Load any required metadata into the redux store
     * 3. Create a new Question object to return to metabase-lib methods can
     *    be used
     * 4. Set the component state to the new Question
     */
    async function loadQuestion() {
      if (!questionHash) {
        setLoading(false);
        setError(null);
        setQuestion(null);
        setCard(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // get the card definition from the URL, the "card"
        const deserializedCard = deserializeCardFromUrl(questionHash);

        // pass the decoded card to load any necessary metadata
        // (tables, source db, segments, etc) into
        // the redux store, the resulting metadata will be available as metadata on the
        // component props once it's available
        await loadMetadata(deserializedCard, { includeSensitiveFields });

        if (cancelled) {
          return;
        }

        // instantiate a new question object using the metadata and saved question
        // so we can use metabase-lib methods to retrieve information and modify
        // the question
        const newQuestion = new Question(deserializedCard, metadataRef.current);

        // finally, set state to store the Question object so it can be passed
        // to the component using the loader, keep a reference to the card
        // as well
        setQuestion(newQuestion);
        setCard(deserializedCard);
      } catch (err) {
        if (!cancelled) {
          setError(err);
          setQuestion(null);
          setCard(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadQuestion();

    return () => {
      cancelled = true;
    };
  }, [questionHash, includeSensitiveFields, loadMetadata]);

  // if the metadata changes for some reason we need to make sure we
  // update the question with that metadata
  useEffect(() => {
    if (metadata && card) {
      setQuestion(new Question(card, metadata));
    }
  }, [metadata, card]);

  // call the child function with our loaded question
  return children({ question, loading, error });
}

export function AdHocQuestionLoader({
  questionHash,
  includeSensitiveFields,
  children,
}: AdHocQuestionLoaderProps) {
  const dispatch = useDispatch();
  const metadata = useSelector((state) =>
    getMetadata(state, { includeSensitiveFields }),
  );

  const loadMetadata = useCallback(
    async (
      card: UnsavedCard,
      options?: { includeSensitiveFields?: boolean },
    ) => {
      await dispatch(loadMetadataForCard(card, options));
    },
    [dispatch],
  );

  return (
    <AdHocQuestionLoaderView
      questionHash={questionHash}
      metadata={metadata}
      loadMetadataForCard={loadMetadata}
      includeSensitiveFields={includeSensitiveFields}
    >
      {children}
    </AdHocQuestionLoaderView>
  );
}
