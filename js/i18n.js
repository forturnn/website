(function () {
  var translations = {
    "nav.projects": { en: "Catalog", nl: "Catalogus" },
    "nav.about": { en: "About", nl: "Over mij" },
    "nav.profile": { en: "Profile", nl: "Profiel" },

    "profile.back": { en: "← Back to site", nl: "← Terug naar de site" },
    "profile.heading": { en: "Profile", nl: "Profiel" },
    "profile.sub": { en: "Business profile, work experience, and education.", nl: "Bedrijfsprofiel, werkervaring en opleiding." },

    "profile.section.business": { en: "Business Profile", nl: "Bedrijfsprofiel" },
    "profile.business.text": { en: "Calvin is an experienced data analyst with a background in aviation and consultancy. He has hands-on experience and a passion for using data tools such as Power BI, SQL, and Python to make data insightful and to optimize processes. He excels at structuring and modeling information to identify areas for improvement, primarily through dashboards and analysis. Structured, organized, and proactive, he brings order and calm to any team, taking ownership and delivering results even in high-pressure situations.", nl: "Calvin is een ervaren data-analist met een achtergrond in luchtvaart en consultancy. Hij heeft ervaring en passie voor het gebruik van data tools zoals Power BI, SQL en Python om data inzichtelijk te maken en processen te optimaliseren. Hij kan informatie goed structureren en modelleren om optimalisatiepunten te identificeren, voornamelijk door middel van dashboards en analyses. Gestructureerd, georganiseerd en met een proactieve houding brengt hij rust en orde binnen elk team, waarbij hij verantwoordelijkheid neemt en resultaten behaalt, zelfs in stressvolle situaties." },

    "profile.section.experience": { en: "Work Experience", nl: "Werkervaring" },

    "profile.exp1.role": { en: "Data Analyst", nl: "Data-analist" },
    "profile.exp1.date": { en: "2025 — Present", nl: "2025 — Heden" },
    "profile.exp1.desc": { en: "Calvin works as a data analyst at Dienst Toeslagen, the Dutch government agency responsible for administering benefits such as housing, healthcare, and childcare allowances. He builds dashboards and reports using Python, SAS, and SQL to monitor processes, safeguard data quality, and support policy and operational decision-making across the organization.", nl: "Calvin werkt als data-analist bij Dienst Toeslagen, de Nederlandse overheidsinstantie die toeslagen zoals huur-, zorg- en kinderopvangtoeslag verzorgt. Hij bouwt dashboards en rapportages met Python, SAS en SQL om processen te monitoren, datakwaliteit te waarborgen en beleids- en operationele besluitvorming binnen de organisatie te ondersteunen." },

    "profile.exp2.role": { en: "IT Consultant — Data/Business Analyst", nl: "IT Consultant — Data/Business Analist" },
    "profile.exp2.org": { en: "Capgemini (IT Consultancy) · Placed at KLM", nl: "Capgemini (IT-consultancy) · Gedetacheerd bij KLM" },
    "profile.exp2.desc1": { en: "As part of the Disruption & Service Recovery team, Calvin was responsible for two major projects. He led the Passenger Disruption Dashboard project, defining data requirements, making SQL databases available, and connecting them to a Power BI dashboard. Working with data scientists and engineers, he validated data to provide a complete view of the customer journey. He also developed the compensation application \"GPS,\" for which he analyzed requirements, wrote user stories, and tested functionality to optimize processes.", nl: "Als onderdeel van het Disruptie en Service Recovery team was Calvin verantwoordelijk voor twee grote projecten. Hij leidde het Passenger Disruption Dashboard project, waarin hij data requirements opstelde, SQL-databases beschikbaar maakte en koppelde aan een Power BI-dashboard. Samen met data scientists en engineers valideerde hij data om een integraal overzicht van de klantreis te bieden. Daarnaast ontwikkelde hij de compensatieapplicatie \"GPS\", waarvoor hij requirements analyseerde, user stories opstelde en de functionaliteiten testte om processen te optimaliseren." },
    "profile.exp2.desc2": { en: "Calvin combines technical expertise in tools like SQL and Power BI with a strong focus on data quality, collaboration, and building data-driven solutions that are both transparent and user-friendly.", nl: "Calvin combineert technische expertise in tools als SQL en Power BI met een sterke focus op datakwaliteit, samenwerking en het creëren van datagedreven oplossingen die zowel transparant als gebruiksvriendelijk zijn." },

    "profile.exp3.role": { en: "Head of Operations & Data Analyst", nl: "Head of Operations & Data Analist" },
    "profile.exp3.desc": { en: "Calvin was responsible for operations and the operations management team at TringTring during a period of rapid scaling. He optimized processes, managed a network of 300 bike couriers, and analyzed data to develop strategies and increase revenue. He also built dashboards and reports for financial overview, network planning, and performance monitoring, further supporting the organization's growth and efficiency.", nl: "Calvin was verantwoordelijk voor de operaties en het operationele managementteam bij TringTring tijdens een dynamische opschalingsfase. Hij optimaliseerde processen, beheerde een netwerk van 300 fietskoeriers en analyseerde data om strategieën te ontwikkelen en omzet te verhogen. Daarnaast bouwde hij dashboards en rapporten voor financieel overzicht, netwerkplanning en prestatiemonitoring, waarmee hij de groei en efficiëntie van de organisatie verder ondersteunde." },

    "profile.section.education": { en: "Education", nl: "Opleiding" },
    "profile.edu1.org": { en: "Amsterdam University of Applied Sciences", nl: "Hogeschool van Amsterdam" },
    "profile.edu2.org": { en: "Secondary School", nl: "Middelbare School" },

    "profile.section.languages": { en: "Languages", nl: "Talen" },
    "lang.english": { en: "English", nl: "Engels" },
    "lang.dutch": { en: "Dutch", nl: "Nederlands" },
    "lang.cantonese": { en: "Cantonese", nl: "Kantonees" },

    "skill.dataAnalysis": { en: "Data Analysis", nl: "Data-analyse" },
    "skill.dataQuality": { en: "Data Quality", nl: "Datakwaliteit" },
    "skill.publicSector": { en: "Public Sector", nl: "Publieke sector" },
    "skill.reporting": { en: "Reporting", nl: "Rapportage" },
    "skill.requirementsAnalysis": { en: "Requirements Analysis", nl: "Requirementsanalyse" },
    "skill.dataValidation": { en: "Data Validation", nl: "Data-validatie" },
    "skill.collaboration": { en: "Collaboration", nl: "Samenwerking" },
    "skill.testing": { en: "Testing", nl: "Testen" },
    "skill.problemSolving": { en: "Problem Solving", nl: "Probleemoplossing" },
    "skill.processOptimization": { en: "Process Optimization", nl: "Procesoptimalisatie" },
    "skill.teamManagement": { en: "Team Management", nl: "Teambeheer" },
    "skill.financialPlanning": { en: "Financial Planning", nl: "Financiële planning" },
    "skill.strategy": { en: "Strategy", nl: "Strategie" },
    "skill.networkPlanning": { en: "Network Planning", nl: "Netwerkplanning" },
    "skill.organizing": { en: "Organizing", nl: "Organiseren" },
    "skill.customerFocused": { en: "Customer-Focused", nl: "Klantgericht" }
  };

  var STORAGE_KEY = "siteLang";

  function getLang() {
    return localStorage.getItem(STORAGE_KEY) || "en";
  }

  function applyLang(lang) {
    document.documentElement.setAttribute("lang", lang);
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var entry = translations[el.getAttribute("data-i18n")];
      if (entry && entry[lang] != null) el.textContent = entry[lang];
    });
    document.querySelectorAll("#lang-toggle [data-lang]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-lang") === lang);
    });
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
    applyLang(lang);
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyLang(getLang());
    var toggle = document.getElementById("lang-toggle");
    if (toggle) {
      toggle.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-lang]");
        if (!btn) return;
        setLang(btn.getAttribute("data-lang"));
      });
    }
  });
})();
