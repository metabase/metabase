export function useWebNotification() {
  const requestPermission = async () => {
    const permission = await Notification.requestPermission();
    return permission;
  };

  const showNotification = (title: string, body: string) => {
    new Notification(title, {
      body,
      icon: "app/assets/img/favicon-32x32.png",
    });
  };

  return [requestPermission, showNotification];
}
