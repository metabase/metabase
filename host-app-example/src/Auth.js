export const AuthButton = () => {
  const onAuth = () => {
    fetch("/sso/metabase", {
      method: "GET",
      credentials: "include",
    })
      .then(response => response.json())
      .then(data => {
        console.log(data);
      });
  };

  return <button onClick={onAuth}>AuthButton</button>;
};
