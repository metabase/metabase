import { t } from "ttag";

import {
  Api,
  useCreateCardFromCsvMutation,
  useListDatabasesQuery,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { getErrorMessage } from "metabase/api/utils";
import { getUserPersonalCollectionId } from "metabase/current-user";
import { useMetabotContext } from "metabase/metabot/context";
import { useDispatch, useSelector } from "metabase/redux";
import {
  MAX_UPLOAD_SIZE,
  UPLOAD_DATA_FILE_TYPES,
} from "metabase/redux/uploads";
import { useSetting } from "metabase/settings";
import { uuid } from "metabase/utils/uuid";
import type { MetabotUploadedFile } from "metabase-types/api";

import {
  type AttachmentDraftFile,
  EMPTY_ATTACHMENT_DRAFT,
} from "../attachment-state";
import {
  FIXED_METABOT_IDS,
  type MetabotProfileId,
  resolveMetabotProfileId,
} from "../constants";

export const MAX_METABOT_ATTACHMENTS = 5;

export function useMetabotAttachments(
  conversationId: string,
  metabotId: number,
  profile: MetabotProfileId | undefined,
) {
  const { attachmentDrafts, getAttachmentDraft, setAttachmentDraft } =
    useMetabotContext();
  const draft = attachmentDrafts[conversationId] ?? EMPTY_ATTACHMENT_DRAFT;
  const resolvedProfile = resolveMetabotProfileId(profile);
  const uploadSettings = useSetting("uploads-settings");
  const supported =
    !!uploadSettings?.db_id &&
    metabotId === FIXED_METABOT_IDS.DEFAULT &&
    (resolvedProfile === "internal" || resolvedProfile === "nlq");
  const collectionId = useSelector(getUserPersonalCollectionId);
  const { data, isLoading } = useListDatabasesQuery(undefined, {
    skip: !supported || !uploadSettings?.db_id,
  });
  const available =
    supported &&
    !!collectionId &&
    !!data?.data.find((database) => database.id === uploadSettings?.db_id)
      ?.can_upload;
  const disabledReason = !uploadSettings?.db_id
    ? t`An administrator needs to enable CSV uploads.`
    : isLoading
      ? t`Checking upload permissions…`
      : t`You don't have permission to upload files.`;
  const [upload] = useCreateCardFromCsvMutation();
  const dispatch = useDispatch();
  const getDraft = () => getAttachmentDraft(conversationId);
  const setDraft = (next: typeof draft) =>
    setAttachmentDraft(conversationId, next);
  const updateFile = (file: AttachmentDraftFile) => {
    const current = getDraft();
    setDraft({
      ...current,
      files: current.files.map((item) => (item.id === file.id ? file : item)),
    });
  };

  const addFiles = (files: File[]) => {
    const current = getDraft();
    if (!available || current.status !== "idle") {
      return;
    }
    if (current.files.length + files.length > MAX_METABOT_ATTACHMENTS) {
      setDraft({
        ...current,
        error: t`You can attach up to ${MAX_METABOT_ATTACHMENTS} files per message.`,
      });
      return;
    }
    const invalid = files.find(
      (file) =>
        !UPLOAD_DATA_FILE_TYPES.some((extension) =>
          file.name.toLowerCase().endsWith(extension),
        ) ||
        file.size > MAX_UPLOAD_SIZE ||
        file.name.length > 255,
    );
    if (invalid) {
      setDraft({
        ...current,
        error: t`Choose CSV or TSV files up to 50 MB with filenames of at most 255 characters.`,
      });
      return;
    }
    setDraft({
      ...current,
      error: undefined,
      files: [
        ...current.files,
        ...files.map(
          (file): AttachmentDraftFile => ({
            id: uuid(),
            file,
            status: "pending",
          }),
        ),
      ],
    });
  };

  const prepare = async (): Promise<MetabotUploadedFile[] | undefined> => {
    if (!supported) {
      return [];
    }
    const current = getDraft();
    if (current.status !== "idle") {
      return;
    }
    if (!current.files.length) {
      return [];
    }
    if (!available || !collectionId) {
      setDraft({ ...current, error: disabledReason });
      return;
    }
    if (current.files.some((file) => file.status === "error")) {
      setDraft({
        ...current,
        error: t`Retry or remove the failed files before sending.`,
      });
      return;
    }
    setDraft({ ...current, error: undefined, status: "uploading" });
    for (const item of current.files) {
      if (item.status === "saved") {
        continue;
      }
      updateFile({ ...item, status: "uploading" });
      try {
        const cardId = await upload({
          file: item.file,
          collection_id: collectionId,
        }).unwrap();
        updateFile({
          ...item,
          status: "saved",
          attachment: {
            card_id: cardId,
            filename: item.file.name,
            size: item.file.size,
            media_type: item.file.name.toLowerCase().endsWith(".tsv")
              ? "text/tab-separated-values"
              : "text/csv",
          },
        });
        dispatch(
          Api.util.invalidateTags([
            listTag("collection"),
            listTag("collection-tree"),
          ]),
        );
      } catch (error) {
        const status =
          typeof error === "object" && error !== null && "status" in error
            ? error.status
            : undefined;
        const ambiguous = typeof status !== "number" || status >= 500;
        updateFile({
          ...item,
          status: "error",
          ambiguous,
          message: ambiguous
            ? t`This file may have been saved. Check your personal collection before uploading it again.`
            : getErrorMessage(error, t`Unable to upload this file.`),
        });
      }
    }
    const saved = getDraft();
    if (saved.files.some((file) => file.status !== "saved")) {
      setDraft({ ...saved, status: "idle" });
      return;
    }
    setDraft({ ...saved, status: "sending" });
    return saved.files.flatMap((file) =>
      file.status === "saved" ? [file.attachment] : [],
    );
  };

  return {
    supported,
    available,
    disabledReason,
    collectionId,
    draft,
    addFiles,
    prepare,
    finish: (success: boolean) =>
      setDraft(
        success ? EMPTY_ATTACHMENT_DRAFT : { ...getDraft(), status: "idle" },
      ),
    finishRetry: () => {
      const current = getDraft();
      setDraft({
        ...current,
        files: current.files.filter((file) => file.status !== "saved"),
      });
    },
    remove: (id: string) => {
      const current = getDraft();
      if (current.status === "idle") {
        setDraft({
          ...current,
          error: undefined,
          files: current.files.filter((file) => file.id !== id),
        });
      }
    },
    retry: (id: string) => {
      const item = getDraft().files.find((file) => file.id === id);
      if (getDraft().status === "idle" && item?.status === "error") {
        updateFile({ id: item.id, file: item.file, status: "pending" });
      }
    },
  };
}

export type MetabotAttachmentsController = ReturnType<
  typeof useMetabotAttachments
>;
