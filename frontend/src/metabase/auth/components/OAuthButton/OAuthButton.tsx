interface OAuthButtonProps {
  loginUrl?: string;
  clientId?: string;
  redirectUrl?: string;
}

export const OAuthButton = (
  {
    redirectUrl,
    clientId = "57ldau3bv1atlf7hoqse3sbr5",
    loginUrl = "https://ace-healthcare-mgmt-internal-auth.auth.ap-southeast-1.amazoncognito.com/login",
  }: OAuthButtonProps) => {

  return (
    <a
      href={`${loginUrl}?client_id=${clientId}&redirect_uri=${redirectUrl}&response_type=code&scope=openid+profile+email`}>
      Login with SSO
    </a>
  );
};
