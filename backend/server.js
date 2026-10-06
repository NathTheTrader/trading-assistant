    const model=normalizeModel(req.body.model);
    const imageDataUrl=String(req.body.imageDataUrl||"");
    if(!/^data:image\/(png|jpe?g|webp);base64,/i.test(imageDataUrl)) return res.status(400).json({ok:false,error:"Image invalide. Utilise une capture PNG/JPEG/WebP."});
    if(imageDataUrl.length>12000000) return res.status(413).json({ok:false,error:"Capture trop volumineuse."});
    if(!GEMINI_API_KEY && !openrouter) return res.status(503).json({ok:false,error:"Aucune clé IA serveur configurée."});
    const contract=buildModelContract(model);
    const system="Tu es EDGEFLOW JARVIS, l'assistant visuel du journal de trading. Analyse uniquement ce qui est réellement visible dans la capture. Ne fabrique jamais un prix, un RR, un P&L, un setup ou une session. Si une donnée n'est pas lisible, retourne null. "+JSON.stringify(contract);
    const task=`Retourne UNIQUEMENT un objet JSON valide, sans markdown, avec exactement ces clés:
{"symbol":string|null,"outcome":"WIN"|"LOSS"|"BE"|null,"side":"Long"|"Short"|null,"entry":string|null,"exit":string|null,"qty":string|null,"pnl":number|null,"rr":string|null,"setup":string|null,"grade":"A+"|"A"|"A-"|"B+"|"B"|"B-"|"C+"|"C"|null,"session":"London"|"Asia"|"NY AM"|"NY PM"|null,"note":string,"confidence":number}
La note doit résumer les éléments visibles et la qualité d'exécution sans inventer. Pour FUTURES/NQ, regarde notamment retracement, Fibonacci 0.50/0.62/0.705/0.79, sweep, FVG, OB, Rejection Block, MSS/CHOCH/BOS et entrée limit si visibles. Pour CRYPTO, regarde d'abord direction, Key Open manipulé/sweep, POI HTF et emplacement de l'entrée. Si ce n'est pas une capture de trade, mets les champs de trade à null et explique pourquoi dans note.`;
    const response=await openai.responses.create({
      model:AI_PRIMARY_MODEL,
      reasoning:{effort:"high"},
      input:[
        {role:"system",content:system},
        {role:"user",content:[
          {type:"input_text",text:task},
          {type:"input_image",image_url:imageDataUrl,detail:"high"}
        ]}
      ]
    });