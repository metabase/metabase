<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Metabase</title>
  <link rel="icon" href="metabot.svg" />
  <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.3/jquery.min.js"></script>
  <!-- Copyright April 1, 2023 -->
</head>

<body style="width: 100vw; height: 100vh; overflow:hidden; padding: 0; margin: 0;">
  <img
    src="src/BugFreeMetabase.png"
    style="object-fit: contain;"
  />
  <script>
    $(document).ready(function () {
      var counter = -Math.SQRT1_2;

      $("img").click(function () {
        counter = counter + Math.LN2;

        if (counter > Math.PI) {
          window.location.replace(atob('aHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1kUXc0dzlXZ1hjUQ=='))
        }
      });
    });
  </script>
</body>
