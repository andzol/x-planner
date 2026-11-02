const $ = (id) => document.getElementById(id);
chrome.storage.local.get({ repo: "andzol/x-wisdom-scheduler", token: "" }).then((s) => {
  $("repo").value = s.repo;
  $("token").placeholder = s.token ? "saved (leave empty to keep)" : "github_pat_…";
});
$("save").onclick = async () => {
  const upd = { repo: $("repo").value.trim() || "andzol/x-wisdom-scheduler" };
  if ($("token").value.trim()) upd.token = $("token").value.trim();
  await chrome.storage.local.set(upd);
  $("token").value = ""; $("token").placeholder = "saved (leave empty to keep)";
  $("msg").textContent = "Saved";
};
