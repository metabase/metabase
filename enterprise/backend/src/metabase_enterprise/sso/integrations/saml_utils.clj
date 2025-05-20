
(ns metabase-enterprise.sso.integrations.saml-utils
  "Functions for handling SAML authentication with the SDK side, including HTML popups")

(defn- generate-saml-html-popup [key exp iat origin continue-url]

  (str "<!DOCTYPE html>
<html>
<head>
  <title>Authentication Complete</title>
  <script>
    const authData = {
      id: \"" key "\",
      exp: " exp ",
      iat: " iat ",
      status: \"ok\"
    };
    if (window.opener) {
      try {
        window.opener.postMessage({
          type: 'SAML_AUTH_COMPLETE',
          authData: authData
        }, '" origin "');

        setTimeout(function() {
          window.close();
        }, 500);
      } catch(e) {
        console.error('Error sending message:', e);
        document.body.innerHTML += '<p>Error: ' + e.message + '</p>';
      }
    } else {
      window.location.href = '" continue-url "';
    }
  </script>
</head>
<body style=\"background-color: white; margin: 20px; padding: 20px;\">
  <h3>Authentication complete</h3>
  <p>This window should close automatically.</p>
  <p>If it doesn't close, please click the button below:</p>
  <button onclick=\"window.close()\">Close Window</button>
</body>
</html>"))

(defn create-token-response
  "Create a token response with HTML and JavaScript to post the auth message"
  [session origin continue-url]
  (let [current-time (quot (System/currentTimeMillis) 1000)
        expiration-time (+ current-time 86400)]
    {:status 200
     :headers {"Content-Type" "text/html"}
     :body (generate-saml-html-popup (:key session) expiration-time current-time origin continue-url)}))