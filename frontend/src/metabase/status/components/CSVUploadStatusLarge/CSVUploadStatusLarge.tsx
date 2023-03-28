import React from "react";
import { t } from "ttag";
import Link from "metabase/core/components/Link";

import StatusLarge from "../StatusLarge";

export interface CSVUploadLargeProps {
  isActive?: boolean;
  onCollapse?: () => void;
}

const CSVUploadLarge = ({
  collection,
  uploads,
  onCollapse,
}: CSVUploadLargeProps): JSX.Element => {
  const status = {
    title: getTitle(uploads, collection),
    items: uploads.map(upload => ({
      id: upload.id,
      title: upload.name,
      icon: "model",
      description: getDescription(upload),
      isInProgress: isSyncInProgress(upload),
      isCompleted: isSyncCompleted(upload),
      isAborted: isSyncAborted(upload),
    })),
  };

  return <StatusLarge status={status} onCollapse={onCollapse} />;
};

const getTitle = (uploads, collection) => {
  const isDone = uploads.every(isSyncCompleted);
  const isError = uploads.some(isSyncAborted);

  if (isDone) {
    return t`Data added to ${collection.name}`;
  } else if (isError) {
    return t`Error uploading your CSV`;
  } else {
    return t`Uploading data to ${collection.name}...`;
  }
};

const isSyncInProgress = upload => upload.status === "in-progress";

const isSyncCompleted = upload => upload.status === "complete";

const isSyncAborted = upload => upload.status === "error";

const getDescription = upload =>
  upload.status === "complete" ? <Link>Start exploring</Link> : "";

// interface StatusCardProps {
//   database: Database;
//   isActive?: boolean;
// }

// const StatusCard = ({
//   database,
//   isActive,
// }: StatusCardProps): JSX.Element | null => {
//   const isVisible = useStatusVisibility(isActive || isSyncInProgress(database));

//   if (!isVisible) {
//     return null;
//   }

//   return (
//     <StatusCardRoot key={database.id}>
//       <StatusCardIcon>
//         <Icon name="database" />
//       </StatusCardIcon>
//       <StatusCardBody>
//         <StatusCardTitle>
//           <Ellipsified>{database.name}</Ellipsified>
//         </StatusCardTitle>
//         <StatusCardDescription>
//           {getDescription(database)}
//         </StatusCardDescription>
//       </StatusCardBody>
//       {isSyncInProgress(database) && (
//         <StatusCardSpinner size={24} borderWidth={3} />
//       )}
//       {isSyncCompleted(database) && (
//         <StatusCardIconContainer>
//           <Icon name="check" size={12} />
//         </StatusCardIconContainer>
//       )}
//       {isSyncAborted(database) && (
//         <StatusCardIconContainer isError={true}>
//           <Icon name="warning" size={12} />
//         </StatusCardIconContainer>
//       )}
//     </StatusCardRoot>
//   );
// };

export default CSVUploadLarge;
