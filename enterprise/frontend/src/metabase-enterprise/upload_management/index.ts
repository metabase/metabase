import {
  PLUGIN_UPLOAD_MANAGEMENT,
  lazyPluginComponent,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { StorageSetupProvider } from "metabase-enterprise/storage/StorageSetupProvider";

// By path, not through the `google_drive` barrel: a static import of the barrel
// would pull the four components below back into the initial bundle.
import { FileUploadErrorModal } from "../google_drive/PausedModal";

const googleDrive = () => import("../google_drive");

/**
 * Initialize upload_management plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("upload_management")) {
    PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable = lazyPluginComponent(() =>
      import("./UploadManagementTable").then(
        ({ UploadManagementTable }) => UploadManagementTable,
      ),
    );
  }

  if (hasPremiumFeature("hosting")) {
    // The reason we're showing this panel even to instances without the dwh
    // is because we want to show them the storage upsell.
    PLUGIN_UPLOAD_MANAGEMENT.GdriveAddDataPanel = lazyPluginComponent(() =>
      googleDrive().then(({ GdriveAddDataPanel }) => GdriveAddDataPanel),
    );
    // The real storage-setup provider owns the cloud-add-ons purchase
    // endpoints, so it only activates on hosted instances.
    //
    // Eager on purpose: it wraps `children`, so deferring it would blank the
    // Add data modal until its chunk arrived.
    PLUGIN_UPLOAD_MANAGEMENT.StorageSetupProvider = StorageSetupProvider;
  }

  if (hasPremiumFeature("hosting") && hasPremiumFeature("attached_dwh")) {
    // Eager on purpose: the OSS default here is a working modal rather than a
    // placeholder, so deferring would make the enterprise build slower to reach
    // what OSS shows immediately.
    PLUGIN_UPLOAD_MANAGEMENT.FileUploadErrorModal = FileUploadErrorModal;
    PLUGIN_UPLOAD_MANAGEMENT.GdriveConnectionModal = lazyPluginComponent(() =>
      googleDrive().then(({ GdriveConnectionModal }) => GdriveConnectionModal),
    );
    PLUGIN_UPLOAD_MANAGEMENT.GdriveSyncStatus = lazyPluginComponent(() =>
      googleDrive().then(({ GdriveSyncStatus }) => GdriveSyncStatus),
    );
    PLUGIN_UPLOAD_MANAGEMENT.GdriveDbMenu = lazyPluginComponent(() =>
      googleDrive().then(({ GdriveDbMenu }) => GdriveDbMenu),
    );
  }
}
