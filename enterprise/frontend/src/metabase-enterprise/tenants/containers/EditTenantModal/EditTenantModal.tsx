import { useMemo } from "react";
import type { Params } from "react-router/lib/Router";
import { t } from "ttag";
import _ from "underscore";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { Modal } from "metabase/ui";
import {
  useGetTenantQuery,
  useUpdateTenantMutation,
} from "metabase-enterprise/api";
import type { Tenant } from "metabase-types/api";

import { TenantForm } from "../../components/TenantForm";

interface EditUserModalProps {
  onClose: () => void;
  params: Params;
}

export const EditTenantModal = ({ params, onClose }: EditUserModalProps) => {
  const [sendToast] = useToast();

  const tenantId = params.tenantId ? parseInt(params.tenantId, 10) : undefined;
  const {
    data: tenant = {},
    isLoading,
    error,
  } = useGetTenantQuery(tenantId ?? skipToken);
  const [updateTenant] = useUpdateTenantMutation();

  const initialValues = useMemo(
    () => _.pick(tenant, ["id", "name", "slug", "attributes"]),
    [tenant],
  );

  const handleSubmit = async (vals: Partial<Tenant>) => {
    if (typeof vals.id !== "number") {
      throw new Error("tenant should have an id");
    }
    const tenant = _.omit({ ...vals, id: vals.id ?? 0 }, "slug");

    await updateTenant(tenant).unwrap();
    sendToast({ message: t`Tenant update successful` });
    onClose();
  };

  return (
    <Modal opened title={t`Edit tenant`} padding="xl" onClose={onClose}>
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <TenantForm
          initialValues={initialValues}
          onCancel={onClose}
          onSubmit={handleSubmit}
        />
      </LoadingAndErrorWrapper>
    </Modal>
  );
};
