# git-split

## development

Build the dev-container:
```bash
docker build --build-arg UID=$(id -u) --build-arg GID=$(id -g) -t git-split:devcontainer .
```

Run the dev-container:
```bash
docker run --rm -it \
  --volume "../claude/state:/home/developer/.claude" \
  --volume "../claude/claude.json:/home/developer/.claude.json" \
  --volume "../claude/bin/claude:/home/developer/.local/bin/claude:ro" \
  --volume ".:/home/developer/git-split" \
  --workdir "/home/developer/git-split" \
  claude-devcontainer claude
```
