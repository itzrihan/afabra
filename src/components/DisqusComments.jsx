import { useEffect } from "react";

export default function DisqusComments({ identifier, title }) {
  useEffect(() => {
    if (!identifier || !title) return;

    if (window.DISQUS) {
      window.DISQUS.reset({
        reload: true,
        config: function () {
          this.page.identifier = identifier;
          this.page.url = window.location.href;
          this.page.title = title;
        },
      });
    } else {
      window.disqus_config = function () {
        this.page.identifier = identifier;
        this.page.url = window.location.href;
        this.page.title = title;
      };

      const script = document.createElement("script");
      script.src = "https://afabra-fun.disqus.com/embed.js";
      script.setAttribute("data-timestamp", +new Date());
      script.async = true;
      document.body.appendChild(script);
    }
  }, [identifier, title]);

  return (
    <div className="w-full bg-[#191826] rounded-lg p-4 mt-2">
      <h2 className="text-white text-xl font-semibold mb-4">Comments</h2>
      <div id="disqus_thread" />
    </div>
  );
}
