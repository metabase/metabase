import { definePluginSlot } from "metabase/plugin-slots";

import { _FileUploadErrorModal } from "./components/FileUploadStatusLarge/FileUploadErrorModal";

export const PLUGIN_FILE_UPLOAD_STATUS = definePluginSlot(() => ({
  FileUploadErrorModal: _FileUploadErrorModal,
}));
