import { useCallback, useEffect, useRef, useState } from "react";
import type { WithRouterProps } from "react-router";
import { replace } from "react-router-redux";
import { useDebounce } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useCreateSlidesMutation,
  useGetSlidesQuery,
  useUpdateSlidesMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch, useSelector } from "metabase/redux";
import { Box, Loader } from "metabase/ui";

import {
  getActiveSlide,
  getActiveSlideIndex,
  getDeckId,
  getDeckName,
  getIsDirty,
  getSlides,
} from "../../selectors";
import {
  addSlide,
  loadDeck,
  markClean,
  moveSlide,
  openGenerateModal,
  removeSlide,
  resetDeck,
  setActiveIndex,
  setName,
  setSlideData,
} from "../../slides.slice";
import type { Slide } from "../../types";
import { GenerateModal } from "../GenerateModal/GenerateModal";
import { SlideContent } from "../Layouts/Layouts";
import { SlideDataPanel } from "../SlideDataPanel/SlideDataPanel";
import { SlideThumbnailList } from "../SlideThumbnailList/SlideThumbnailList";
import { SlidesHeader } from "../SlidesHeader/SlidesHeader";

import S from "./SlidesPage.module.css";

type SlidesPageProps = WithRouterProps<{ entityId: string }>;

export const SlidesPage = ({ params, router }: SlidesPageProps) => {
  const dispatch = useDispatch();
  const [sendToast] = useToast();

  const entityIdParam = params.entityId;
  const isNew = entityIdParam === "new";
  const numericId = !isNew ? Number(entityIdParam) : null;

  const {
    data: existing,
    isLoading: isLoadingExisting,
    error: loadError,
  } = useGetSlidesQuery(
    numericId != null && !Number.isNaN(numericId)
      ? { id: numericId }
      : skipToken,
  );

  const [createSlides, { isLoading: isCreating }] = useCreateSlidesMutation();
  const [updateSlides, { isLoading: isSaving }] = useUpdateSlidesMutation();

  useEffect(() => {
    if (!isNew) {
      return;
    }
    let cancelled = false;
    createSlides({ name: t`Untitled slides` })
      .unwrap()
      .then((deck) => {
        if (!cancelled) {
          dispatch(replace(`/slides/${deck.id}`));
        }
      })
      .catch(() => {
        if (!cancelled) {
          sendToast({
            message: t`Couldn't create slide deck`,
            icon: "warning",
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  useEffect(() => {
    if (existing) {
      dispatch(
        loadDeck({
          id: existing.id,
          name: existing.name,
          slides: existing.slides,
        }),
      );
    }
    return () => {
      dispatch(resetDeck());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  const slides = useSelector(getSlides);
  const activeIndex = useSelector(getActiveSlideIndex);
  const activeSlide = useSelector(getActiveSlide);
  const name = useSelector(getDeckName);
  const deckId = useSelector(getDeckId);
  const isDirty = useSelector(getIsDirty);

  usePageTitle(name || t`Slides`);

  const [saveError, setSaveError] = useState(false);
  const latestRef = useRef({ name, slides });
  latestRef.current = { name, slides };

  useDebounce(
    () => {
      if (!deckId || !isDirty) {
        return;
      }
      updateSlides({
        id: deckId,
        name: latestRef.current.name,
        slides: latestRef.current.slides,
      })
        .unwrap()
        .then(() => {
          dispatch(markClean());
          setSaveError(false);
        })
        .catch(() => setSaveError(true));
    },
    1200,
    [deckId, isDirty, name, slides],
  );

  const saveStatus: "saved" | "saving" | "dirty" | "error" = saveError
    ? "error"
    : isSaving
      ? "saving"
      : isDirty
        ? "dirty"
        : "saved";

  const handlePresent = useCallback(() => {
    if (deckId) {
      router.push(`/slides/${deckId}/present`);
    }
  }, [deckId, router]);

  const handleDataChange = useCallback(
    (data: Slide["data"]) => {
      dispatch(setSlideData({ index: activeIndex, data }));
    },
    [activeIndex, dispatch],
  );

  if (isNew || isCreating || (numericId != null && isLoadingExisting)) {
    return (
      <Box className={S.empty}>
        <Loader />
      </Box>
    );
  }
  if (loadError || !existing) {
    return <Box className={S.empty}>{t`Couldn't load this deck.`}</Box>;
  }

  return (
    <Box className={S.page}>
      <SlidesHeader
        name={name}
        onNameChange={(n) => dispatch(setName(n))}
        onPresent={handlePresent}
        onGenerate={() => dispatch(openGenerateModal())}
        canPresent={slides.length > 0}
        saveStatus={saveStatus}
      />
      <Box className={S.body}>
        <Box className={S.sidebar}>
          <SlideThumbnailList
            slides={slides}
            activeIndex={activeIndex}
            onSelect={(i) => dispatch(setActiveIndex(i))}
            onAdd={() => dispatch(addSlide(undefined))}
            onDelete={(i) => dispatch(removeSlide(i))}
            onReorder={(from, to) => dispatch(moveSlide({ from, to }))}
          />
        </Box>
        <Box className={S.canvas}>
          {activeSlide && (
            <Box className={S.slideFrame}>
              <SlideContent slide={activeSlide} />
            </Box>
          )}
        </Box>
        <Box className={S.inspector}>
          {activeSlide && (
            <SlideDataPanel slide={activeSlide} onChange={handleDataChange} />
          )}
        </Box>
      </Box>
      <GenerateModal />
    </Box>
  );
};
