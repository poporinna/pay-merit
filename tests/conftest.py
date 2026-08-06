import os
import tempfile

import pytest


@pytest.fixture(autouse=True)
def windows_direct_mode_tempfile_guard(monkeypatch):
    """Allow genlayer-test direct mode to run on Windows.

    genlayer-test 0.29.x swaps stdin through a temporary file and immediately
    unlinks it. Windows can keep that file handle locked for a moment, raising
    PermissionError before the contract is even deployed. The guard is limited
    to pytest's process and only ignores locked files inside the OS temp dir.
    """
    original_unlink = os.unlink
    temp_root = os.path.normcase(os.path.abspath(tempfile.gettempdir()))

    def safe_unlink(path, *args, **kwargs):
        try:
            return original_unlink(path, *args, **kwargs)
        except PermissionError:
            try:
                target = os.path.normcase(os.path.abspath(path))
            except Exception:
                raise
            if target.startswith(temp_root + os.sep):
                return None
            raise

    monkeypatch.setattr(os, "unlink", safe_unlink)


@pytest.fixture
def deploy(direct_deploy):
    """Backward-compatible alias for the GenLayer direct deployment fixture."""
    return direct_deploy
