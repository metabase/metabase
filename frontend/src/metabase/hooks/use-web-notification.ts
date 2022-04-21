import React, { useCallback } from "react";

export function useWebNotification() {
  const requestPermission = useCallback(async () => {
    const permission = await Notification.requestPermission();
    return permission;
  }, []);

  const showNotification = useCallback((title: string, body: string) => {
    const notification = new Notification(title, {
      body,
      icon: "app/assets/img/favicon-32x32.png",
    });

    const closeNotification = (e: Event) => {
      e.preventDefault();
      notification.close();
    };

    notification.addEventListener("click", e => {
      e.preventDefault();
      window.focus();
    });

    window.addEventListener("beforeunload", closeNotification);

    document.addEventListener(
      "visibilitychange",
      e => {
        closeNotification(e);
        window.removeEventListener("beforeunload", closeNotification);
      },
      { once: true },
    );
  }, []);

  return [requestPermission, showNotification];
}
