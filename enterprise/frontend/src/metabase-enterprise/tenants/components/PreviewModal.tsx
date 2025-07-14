import { CompactSign } from "jose"; // using jose because jsonwebtoken doesn't work on the web :-/
import { useEffect, useMemo, useState } from "react";

import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import { useSetting } from "metabase/common/hooks";
import { Box,  Loader, Modal } from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";
import type { User } from "metabase-types/api";

export function PreviewModal({ user, onClose }: { user: User; onClose: () => void }) {
  const embedUrl = usePreviewUrl(user);

  // the credentialless attribute is chrome-only, and necessary to get enough isolation for this to not log
  // out the host user. React also doesn't support it, so we have to use dangerouslySetInnerHTML
  // https://developer.mozilla.org/en-US/docs/Web/Security/IFrame_credentialless
  const iframeHtml = `
    <iframe
      src="${embedUrl}"
      width="100%"
      height="600px"
      style="border: none; outline: none;"
      credentialless
      loading="lazy"
    />
  `;

  return (
    <Modal
      opened
      onClose={onClose}
      title={`Preview as ${user.first_name} ${user.last_name}`}
      size="xl"
    >
      <Box p="16px" >
        {!embedUrl ? (
          <Loader />
        ): (
          <Box>
            <CopyTextInput
              value={embedUrl}
            />
            <Box
              bd="1px solid var(--mb-color-border)"
              dangerouslySetInnerHTML={{ __html: iframeHtml }}
            />
          </Box>
        )}
      </Box>
    </Modal>
  )

}

function usePreviewUrl (user: User) {
  const secretKey = useSetting("jwt-shared-secret");
  const siteUrl = useSetting("site-url");
  const { data: tenants } = useListTenantsQuery({ status: "active" });
  const tenant = useMemo(() => {
    return tenants?.data.find((t) => t.id === user.tenant_id);
  }, [tenants, user.tenant_id]);

  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!secretKey || !siteUrl || !tenant) {
      return;
    }

    (async () => {
      const token  = await getToken({
        payload: {
          email: user.email,
          user_id: user.id,
          tenant: tenant.slug,
        },
        secret: secretKey
      });

      setUrl(`${siteUrl}/auth/sso/?jwt=${token}&return_to=${siteUrl}`);
    })();
  }, [user, secretKey, siteUrl, tenant]);
  return url;
}

const getToken = async ({ payload, secret }: { payload: Record<string, string| number | null>, secret: string }) => {
  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  console.log({ payload })

  const token = await new CompactSign(encoder.encode(JSON.stringify(payload)))
        .setProtectedHeader({ alg: "HS256" })
        .sign(key);

  return token;
}