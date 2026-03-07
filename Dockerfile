FROM debian:bookworm-slim

ARG DEBIAN_FRONTEND=noninteractive

ARG UID=1000
ARG GID=1000
RUN groupadd -g ${GID} developer \
 && useradd -m -s /bin/bash -u ${UID} -g ${GID} developer

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ripgrep \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

USER developer

ENV PATH="/home/developer/.local/bin:$PATH"

CMD ["/bin/bash"]
