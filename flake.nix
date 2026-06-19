{
  description = "Metabase release jar";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          lib = pkgs.lib;

          defaultVersion =
            if self ? shortRev then
              "0.0.0-${self.shortRev}"
            else if self ? dirtyShortRev then
              "0.0.0-${self.dirtyShortRev}"
            else
              "UNKNOWN";

          gitRev =
            if self ? rev then
              self.rev
            else if self ? dirtyRev then
              self.dirtyRev
            else if self ? dirtyShortRev then
              self.dirtyShortRev
            else
              "unknown";

          mkMetabaseJar =
            {
              edition ? "oss",
              version ? defaultVersion,
            }:
            let
              frontendDeps = self.packages.${system}.frontendDeps;
              clojureDeps = self.packages.${system}.clojureDeps;
              pythonDeps = self.packages.${system}.pythonDeps;
            in
            pkgs.stdenv.mkDerivation {
              pname = "metabase-${edition}-jar";
              inherit version;

              src = lib.cleanSourceWith {
                src = ./.;
                filter =
                  path: type:
                  let
                    baseName = baseNameOf path;
                  in
                  !(lib.elem baseName [
                    ".git"
                    ".cache"
                    "node_modules"
                    "result"
                    "target"
                  ]);
              };

              nativeBuildInputs = with pkgs; [
                bash
                bun
                clojure
                coreutils
                curl
                findutils
                git
                gnugrep
                gnused
                jdk21
                nodejs_22
                python3
                uv
                which
              ];

              dontConfigure = true;

              buildPhase = ''
                runHook preBuild

                export HOME="$TMPDIR/home"
                export XDG_CACHE_HOME="$TMPDIR/cache"
                export XDG_CONFIG_HOME="$TMPDIR/config"
                export XDG_DATA_HOME="$TMPDIR/share"
                export BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
                export ClojureToolsCache="$TMPDIR/clojure-cache"
                export GIT_CONFIG_GLOBAL="$TMPDIR/gitconfig"
                export UV_CACHE_DIR="$TMPDIR/uv-cache"
                export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
                export GIT_SSL_CAINFO="$SSL_CERT_FILE"
                export CYPRESS_INSTALL_BINARY=0
                export HUSKY=0
                export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
                export PUPPETEER_SKIP_DOWNLOAD=1
                export JAVA_HOME="${pkgs.jdk21}"
                export JAVA_TOOL_OPTIONS="-Duser.home=$HOME -Dmaven.repo.local=$HOME/.m2/repository"
                mkdir -p "$TMPDIR/bin"
                cat > "$TMPDIR/bin/git" <<'EOF'
                #!${pkgs.bash}/bin/bash
                case "$*" in
                  "rev-parse --abbrev-ref HEAD") printf '%s\n' 'unknown' ;;
                  "rev-parse HEAD") printf '%s\n' '${gitRev}' ;;
                  *) exec ${pkgs.git}/bin/git "$@" ;;
                esac
                EOF
                chmod +x "$TMPDIR/bin/git"

                export PATH="$TMPDIR/bin:$JAVA_HOME/bin:$PATH"

                mkdir -p "$HOME" "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME"
                cp -a ${clojureDeps}/m2 "$HOME/.m2"
                cp -a ${clojureDeps}/gitlibs "$HOME/.gitlibs"
                chmod -R u+w "$HOME/.m2" "$HOME/.gitlibs"
                ln -sfn "$HOME/.m2" /build/.m2
                ln -sfn "$HOME/.gitlibs" /build/.gitlibs

                cp -a ${pythonDeps}/. resources/python-sources/
                chmod -R u+w resources/python-sources

                cp -a ${frontendDeps}/node_modules ./node_modules
                chmod -R u+w ./node_modules
                patchShebangs ./node_modules
                patchShebangs ./bin

                git config --global --add safe.directory "$PWD"

                INTERACTIVE=false CI=true SKIP_PYTHON_DEPS=true MB_EDITION=${edition} MB_JAR_FILENAME=metabase.jar \
                  ./bin/build.sh '{:version "${version}"}'

                runHook postBuild
              '';

              installPhase = ''
                runHook preInstall

                install -Dm644 target/uberjar/metabase.jar "$out/share/java/metabase.jar"

                runHook postInstall
              '';

              meta = {
                description = "Metabase ${lib.toUpper edition} release jar";
                homepage = "https://www.metabase.com/";
                license = lib.licenses.agpl3Only;
                platforms = systems;
              };
            };

          frontendDeps = pkgs.stdenv.mkDerivation {
            pname = "metabase-frontend-deps";
            version = defaultVersion;

            src = lib.cleanSourceWith {
              src = ./.;
              filter =
                path: type:
                let
                  baseName = baseNameOf path;
                in
                !(lib.elem baseName [
                  ".git"
                  ".cache"
                  "node_modules"
                  "result"
                  "target"
                ]);
            };

            nativeBuildInputs = with pkgs; [
              bun
              nodejs_22
            ];

            outputHashAlgo = "sha256";
            outputHashMode = "recursive";
            outputHash = "sha256-gMFXXwW+ia0awRfPVjqEKxkr0Kt3FRyOnRcC9ICnx2Y=";

            dontConfigure = true;
            dontFixup = true;
            dontPatchShebangs = true;

            buildPhase = ''
              runHook preBuild

              export HOME="$TMPDIR/home"
              export XDG_CACHE_HOME="$TMPDIR/cache"
              export BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
              export CI=true
              export CYPRESS_INSTALL_BINARY=0
              export HUSKY=0
              export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
              export PUPPETEER_SKIP_DOWNLOAD=1

              mkdir -p "$HOME" "$XDG_CACHE_HOME"
              bun install --frozen-lockfile --ignore-scripts --no-progress
              node ./node_modules/patch-package/index.js
              find node_modules/.bun -path "*/node_modules/.bin" -type d -prune -exec rm -rf {} +

              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p "$out"
              cp -a node_modules "$out/node_modules"

              runHook postInstall
            '';
          };

          clojureDeps = pkgs.stdenv.mkDerivation {
            pname = "metabase-clojure-deps";
            version = defaultVersion;

            src = lib.cleanSourceWith {
              src = ./.;
              filter =
                path: type:
                let
                  baseName = baseNameOf path;
                in
                !(lib.elem baseName [
                  ".git"
                  ".cache"
                  "node_modules"
                  "result"
                  "target"
                ]);
            };

            nativeBuildInputs = with pkgs; [
              cacert
              clojure
              git
              jdk21
            ];

            outputHashAlgo = "sha256";
            outputHashMode = "recursive";
            outputHash = "sha256-WuXuU2tVnBXIwOKUSdZ3BVnWEQQW9sAAZXBjPfvFAaI=";

            dontConfigure = true;
            dontFixup = true;
            dontPatchShebangs = true;

            buildPhase = ''
              runHook preBuild

              export HOME="$TMPDIR/home"
              export XDG_CACHE_HOME="$TMPDIR/cache"
              export GIT_CONFIG_GLOBAL="$TMPDIR/gitconfig"
              export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
              export GIT_SSL_CAINFO="$SSL_CERT_FILE"
              export JAVA_HOME="${pkgs.jdk21}"
              export JAVA_TOOL_OPTIONS="-Duser.home=$HOME -Dmaven.repo.local=$HOME/.m2/repository"
              export PATH="$JAVA_HOME/bin:$PATH"

              mkdir -p "$HOME/.m2" "$HOME/.gitlibs" "$XDG_CACHE_HOME"
              git config --global --add safe.directory "$PWD"

              clojure -P -M:drivers:build:oss
              clojure -P -M:drivers:build:ee
              clojure -P -M:cljs

              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall

              find "$HOME/.m2" \
                \( -name resolver-status.properties -o -name "*.lastUpdated" -o -name _remote.repositories \) \
                -delete
              while IFS= read -r -d "" pack; do
                [ -e "$pack" ] || continue

                repo="''${pack%/objects/pack/*}"
                pack_dir="$(dirname "$pack")"
                tmp_pack_dir="$(mktemp -d)"

                for ext in pack idx rev; do
                  for file in "$pack_dir"/*."$ext"; do
                    [ -e "$file" ] && mv "$file" "$tmp_pack_dir"/
                  done
                done

                for tmp_pack in "$tmp_pack_dir"/*.pack; do
                  git -c safe.directory="$repo" -C "$repo" unpack-objects -q < "$tmp_pack"
                done

                rm -rf "$tmp_pack_dir"
              done < <(find "$HOME/.gitlibs/_repos" -path "*/objects/pack/*.pack" -print0)
              find "$HOME/.gitlibs/_repos" \
                \( -name FETCH_HEAD -o -name ORIG_HEAD -o -name hooks -o -name logs -o -path "*/worktrees/*/index" \) \
                -exec rm -rf {} +

              mkdir -p "$out"
              cp -a "$HOME/.m2" "$out/m2"
              cp -a "$HOME/.gitlibs" "$out/gitlibs"

              runHook postInstall
            '';
          };

          pythonDeps = pkgs.stdenv.mkDerivation {
            pname = "metabase-python-deps";
            version = defaultVersion;

            src = pkgs.fetchurl {
              url = "https://files.pythonhosted.org/packages/8f/a6/21b1e19994296ba4a34bc7abaf4fcb40d7e7787477bdfde58cd843594459/sqlglot-28.6.0-py3-none-any.whl";
              hash = "sha256-ivdugl3IRWpJ+M4EnWm7/NEWZV3aPlMFF1R4ni7fjro=";
            };

            nativeBuildInputs = [ pkgs.unzip ];

            dontUnpack = true;

            installPhase = ''
              runHook preInstall

              mkdir -p "$out"
              unzip -q "$src" -d "$out"

              runHook postInstall
            '';
          };

          mkMetabaseWrapped =
            jar:
            pkgs.stdenv.mkDerivation {
              pname = "metabase-wrapped";
              inherit (jar) version;

              nativeBuildInputs = [ pkgs.makeWrapper ];

              dontUnpack = true;

              installPhase = ''
                runHook preInstall

                makeWrapper ${lib.getExe pkgs.jdk21} $out/bin/metabase \
                  --add-flags "-jar ${jar}/share/java/metabase.jar"

                runHook postInstall
              '';

              meta = {
                description = "Runnable wrapper for the Metabase release jar";
                homepage = "https://www.metabase.com/";
                license = lib.licenses.agpl3Only;
                mainProgram = "metabase";
                platforms = systems;
              };
            };

          default = mkMetabaseJar { };
        in
        {
          inherit default;
          inherit clojureDeps frontendDeps pythonDeps;
          metabase = default;
          metabase-wrapped = mkMetabaseWrapped default;
          ee = mkMetabaseJar { edition = "ee"; };
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.metabase-wrapped}/bin/metabase";
        };
      });
    };
}
