import { definePluginSlot } from "metabase/plugins";

import { _FileUploadErrorModal } from "./components/FileUploadStatusLarge/FileUploadErrorModal";

export const PLUGIN_FILE_UPLOAD_STATUS = definePluginSlot(() => ({
  FileUploadErrorModal: _FileUploadErrorModal,
}));
